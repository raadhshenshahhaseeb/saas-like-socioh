package validation

import (
	"context"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"example.com/catalog-workflow/backend/internal/catalog/model"
)

var (
	skuPattern      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
	pricePattern    = regexp.MustCompile(`^[0-9]{1,14}(\.[0-9]{1,4})?$`)
	currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
)

func Rules(rules model.Rules) error {
	invalid := !utf8.ValidString(rules.TitlePrefix) || utf8.RuneCountInString(rules.TitlePrefix) > 64
	if invalid || strings.ContainsFunc(rules.TitlePrefix, unicode.IsControl) {
		fault := model.NewFault("validation_error", "The title prefix is invalid.")
		fault.Details = []model.Issue{{Code: "invalid_prefix", Field: "title_prefix", Message: "Use at most 64 Unicode characters without control characters."}}
		return fault
	}
	return nil
}

func Products(ctx context.Context, products []model.Product, rules model.Rules) ([]model.Product, error) {
	fault := model.NewFault("validation_error", "The catalog contains invalid product values.")
	seen := make(map[string]bool, len(products))
	validated := make([]model.Product, len(products))
	add := func(row int, field, code, message string) {
		if len(fault.Details) < 100 {
			fault.Details = append(fault.Details, model.Issue{Code: code, Row: row, Field: field, Message: message})
		} else {
			fault.DetailsTruncated = true
		}
	}
	for i, product := range products {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		row := i + 1
		if !skuPattern.MatchString(product.SKU) {
			add(row, "sku", "invalid_sku", "Use 1 to 128 ASCII SKU characters, starting with a letter or digit.")
		}
		if seen[product.SKU] {
			add(row, "sku", "duplicate_sku", "Each SKU must be unique within the input.")
		}
		seen[product.SKU] = true
		if !SafeTitle(product.Title, 200) {
			add(row, "title", "invalid_title", "Use a nonempty title of at most 200 characters without controls or formula-leading text.")
		}
		if !SafeTitle(rules.TitlePrefix+product.Title, 264) {
			add(row, "title", "invalid_output_title", "The resulting title must contain safe text of at most 264 characters.")
		}
		price, ok := Decimal(product.Price)
		if !ok {
			add(row, "price", "invalid_price", "Use a nonnegative decimal with at most 14 integer and four fractional digits.")
		}
		if !currencyPattern.MatchString(product.Currency) {
			add(row, "currency", "invalid_currency", "Use exactly three uppercase ASCII letters.")
		}
		if product.Availability != "in_stock" && product.Availability != "out_of_stock" {
			add(row, "availability", "invalid_availability", "Use in_stock or out_of_stock.")
		}
		product.Price = price
		validated[i] = product
	}
	if len(fault.Details) != 0 {
		return nil, fault
	}
	return validated, nil
}

func SafeTitle(value string, maxCharacters int) bool {
	invalid := value == "" || !utf8.ValidString(value) || utf8.RuneCountInString(value) > maxCharacters
	if invalid || strings.ContainsFunc(value, unicode.IsControl) {
		return false
	}
	trimmed := strings.TrimSpace(value)
	return trimmed != "" && !strings.ContainsRune("=+-@", rune(trimmed[0]))
}

// Decimal normalizes lexical decimals without passing through floating point or database rounding.
func Decimal(value string) (string, bool) {
	if !pricePattern.MatchString(value) {
		return "", false
	}
	integer, fraction, _ := strings.Cut(value, ".")
	integer = strings.TrimLeft(integer, "0")
	if integer == "" {
		integer = "0"
	}
	fraction = strings.TrimRight(fraction, "0")
	if fraction != "" {
		return integer + "." + fraction, true
	}
	return integer, true
}
