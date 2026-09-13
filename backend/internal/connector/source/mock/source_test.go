package mock_test

import (
	"errors"
	"testing"

	"example.com/catalog-workflow/backend/internal/connector/source/mock"
)

func TestUnconfiguredSourceFailsExplicitly(t *testing.T) {
	provider := mock.New()
	if _, err := provider.List(t.Context()); !errors.Is(err, mock.ErrUnexpectedCall) {
		t.Fatal("unconfigured List did not fail")
	}
	if _, err := provider.Open(t.Context(), mock.SampleID); !errors.Is(err, mock.ErrUnexpectedCall) {
		t.Fatal("unconfigured Open did not fail")
	}
}
