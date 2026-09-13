package connector

import (
	"context"
	"errors"
	"io"
	"time"

	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/catalog/pipeline"
	"example.com/catalog-workflow/backend/internal/catalog/validation"
	"example.com/catalog-workflow/backend/internal/connector/source"
	"example.com/catalog-workflow/backend/internal/saas"
)

var (
	ErrNotFound = errors.New("run not found")
	ErrCapacity = errors.New("stored run capacity reached")
)

type Repository interface {
	Create(context.Context, model.Run, int) error
	Complete(context.Context, string, string, model.Result) error
	Fail(context.Context, string, string, *model.Fault) error
	Get(context.Context, string, string) (model.Run, error)
}

type Dependencies struct {
	Repository Repository
	Workspace  *saas.Service
	Source     source.Source
}

type Config struct {
	MaxStoredRuns  int
	CleanupTimeout time.Duration
	Limits         pipeline.Limits
}

type Request struct {
	Source model.Source
	Rules  model.Rules
	Upload []byte
}

type Manager struct {
	deps Dependencies
	cfg  Config
}

func New(deps Dependencies, cfg Config) (*Manager, error) {
	if deps.Repository == nil || deps.Workspace == nil || deps.Source == nil {
		return nil, errors.New("manager dependencies are required")
	}
	return &Manager{deps: deps, cfg: cfg}, nil
}

func (m *Manager) Samples(ctx context.Context) ([]source.Descriptor, error) {
	items, err := m.deps.Source.List(ctx)
	if err != nil {
		return nil, PublicError(ctx, err, "source_unavailable")
	}
	return items, nil
}

func (m *Manager) Process(ctx context.Context, request Request) (model.Run, error) {
	if err := validation.Rules(request.Rules); err != nil {
		return model.Run{}, err
	}
	run := model.Run{ID: model.NewID(), WorkspaceID: m.deps.Workspace.WorkspaceID(), Status: "processing",
		Source: request.Source, Rules: request.Rules, StartedAt: time.Now().UTC()}
	if err := m.deps.Repository.Create(ctx, run, m.cfg.MaxStoredRuns); err != nil {
		if errors.Is(err, ErrCapacity) {
			return model.Run{}, model.NewFault("storage_capacity_exceeded", "The demo has reached its stored run limit. Ask the operator to reset it.")
		}
		return model.Run{}, PublicError(ctx, err, "database_unavailable")
	}
	var input io.ReadCloser
	var err error
	if request.Source.Kind == "sample" {
		input, err = m.deps.Source.Open(ctx, request.Source.SampleID)
	} else {
		input = source.OpenUpload(request.Upload)
	}
	if err != nil || input == nil {
		return model.Run{}, m.failed(ctx, run, PublicError(ctx, err, "source_unavailable"))
	}
	result, processErr := pipeline.Process(ctx, input, request.Rules, m.cfg.Limits)
	closeErr := input.Close()
	if processErr != nil {
		return model.Run{}, m.failed(ctx, run, PublicError(ctx, processErr, "source_unavailable"))
	}
	if closeErr != nil {
		return model.Run{}, m.failed(ctx, run, PublicError(ctx, closeErr, "source_unavailable"))
	}
	if err := m.deps.Repository.Complete(ctx, run.WorkspaceID, run.ID, result); err != nil {
		return model.Run{}, m.failed(ctx, run, PublicError(ctx, err, "database_unavailable"))
	}
	completed, err := m.deps.Repository.Get(ctx, run.WorkspaceID, run.ID)
	if err != nil {
		fault := PublicError(ctx, err, "database_unavailable")
		fault.RunID = run.ID
		return model.Run{}, fault
	}
	return completed, nil
}

func (m *Manager) Get(ctx context.Context, id string) (model.Run, error) {
	if !model.ValidID(id) {
		return model.Run{}, model.NewFault("run_not_found", "The requested result was not found.")
	}
	run, err := m.deps.Repository.Get(ctx, m.deps.Workspace.WorkspaceID(), id)
	if errors.Is(err, ErrNotFound) {
		return model.Run{}, model.NewFault("run_not_found", "The requested result was not found.")
	}
	if err != nil {
		return model.Run{}, PublicError(ctx, err, "database_unavailable")
	}
	return run, nil
}

func (m *Manager) failed(ctx context.Context, run model.Run, fault *model.Fault) *model.Fault {
	fault.RunID = run.ID
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), m.cfg.CleanupTimeout)
	defer cancel()
	// A failed cleanup does not establish a different processing outcome; startup repairs leftovers.
	if err := m.deps.Repository.Fail(cleanup, run.WorkspaceID, run.ID, fault); err != nil {
		return fault
	}
	return fault
}

func PublicError(ctx context.Context, err error, fallback string) *model.Fault {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		return model.NewFault("deadline_exceeded", "The request exceeded its processing deadline.")
	}
	if errors.Is(ctx.Err(), context.Canceled) || errors.Is(err, context.Canceled) {
		return model.NewFault("cancelled", "The request was cancelled before its outcome could be returned.")
	}
	if fault, ok := errors.AsType[*model.Fault](err); ok {
		return fault
	}
	message := "A required service is unavailable. Make a deliberate later attempt."
	if fallback == "database_unavailable" {
		message = "The result could not be stored or read. A known result ID may be checked later."
	}
	return model.NewFault(fallback, message)
}
