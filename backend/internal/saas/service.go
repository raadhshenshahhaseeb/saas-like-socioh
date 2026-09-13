package saas

import (
	"errors"

	"example.com/catalog-workflow/backend/internal/catalog/model"
)

type Service struct{ workspaceID string }

func New(workspaceID string) (*Service, error) {
	if !model.ValidID(workspaceID) {
		return nil, errors.New("invalid configured workspace")
	}
	return &Service{workspaceID: workspaceID}, nil
}

func (s *Service) WorkspaceID() string { return s.workspaceID }
