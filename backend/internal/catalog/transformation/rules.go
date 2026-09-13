package transformation

import (
	"context"

	"example.com/catalog-workflow/backend/internal/catalog/model"
)

func Apply(ctx context.Context, products []model.Product, rules model.Rules) (model.Result, error) {
	result := model.Result{Items: make([]model.Item, 0, len(products)), Counts: model.Counts{Input: len(products)}}
	for i, product := range products {
		if err := ctx.Err(); err != nil {
			return model.Result{}, err
		}
		item := model.Item{Position: i + 1, Input: product, OutputTitle: rules.TitlePrefix + product.Title, Included: true}
		if rules.ExcludeUnavailable && product.Availability == "out_of_stock" {
			item.Included = false
			item.ExclusionReason = "unavailable"
			result.Counts.Excluded++
		} else {
			result.Counts.Included++
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}
