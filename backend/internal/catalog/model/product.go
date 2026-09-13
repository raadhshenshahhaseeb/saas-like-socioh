package model

import "time"

var Columns = []string{"sku", "title", "price", "currency", "availability"}

type Product struct {
	SKU          string `json:"sku"`
	Title        string `json:"title"`
	Price        string `json:"price"`
	Currency     string `json:"currency"`
	Availability string `json:"availability"`
}

type Rules struct {
	TitlePrefix        string `json:"title_prefix"`
	ExcludeUnavailable bool   `json:"exclude_unavailable"`
}

type Item struct {
	Position        int
	Input           Product
	OutputTitle     string
	Included        bool
	ExclusionReason string
}

type Counts struct {
	Input    int `json:"input"`
	Included int `json:"included"`
	Excluded int `json:"excluded"`
}

type Result struct {
	Items  []Item
	Counts Counts
}

type Preview struct {
	Columns []string  `json:"columns"`
	Rows    []Product `json:"rows"`
}

type Source struct {
	Kind     string `json:"kind"`
	SampleID string `json:"sample_id,omitempty"`
}

type Run struct {
	ID              string     `json:"id"`
	WorkspaceID     string     `json:"-"`
	Status          string     `json:"status"`
	Source          Source     `json:"source"`
	Rules           Rules      `json:"rules"`
	Counts          *Counts    `json:"counts"`
	StartedAt       time.Time  `json:"started_at"`
	FinishedAt      *time.Time `json:"finished_at"`
	Preview         *Preview   `json:"preview"`
	ExportAvailable bool       `json:"export_available"`
	Failure         *Fault     `json:"failure"`
}

func Project(items []Item) Preview {
	rows := make([]Product, 0, len(items))
	for _, item := range items {
		if item.Included {
			product := item.Input
			product.Title = item.OutputTitle
			rows = append(rows, product)
		}
	}
	return Preview{Columns: append([]string{}, Columns...), Rows: rows}
}
