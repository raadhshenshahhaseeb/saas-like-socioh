package export

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"

	"example.com/catalog-workflow/backend/internal/catalog/model"
)

func CSV(ctx context.Context, preview model.Preview) ([]byte, error) {
	var output bytes.Buffer
	writer := csv.NewWriter(&output)
	if err := writer.Write(model.Columns); err != nil {
		return nil, fmt.Errorf("write csv header: %w", err)
	}
	for _, product := range preview.Rows {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if err := writer.Write([]string{product.SKU, product.Title, product.Price, product.Currency, product.Availability}); err != nil {
			return nil, fmt.Errorf("write csv record: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("flush csv output: %w", err)
	}
	return output.Bytes(), nil
}
