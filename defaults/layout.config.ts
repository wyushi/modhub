// What the layout shows of each hosted mod. A mod listed is on; one left out is off.
//   slots:  the panes, drawn in list order. `mod` is the hosted mod's plugin
//           name, `pane` the id it opens its pane under, `rows` the slot height
//           (left out: as tall as the tree). `columns` lays them out in a grid.
//   bands:  mods whose band above the prompt and spinner text show, in this order.
//   toasts: mods whose toasts show.
//   status: mods whose status text shows, joined in this order into the one status line.
// Listing a disabled mod is harmless: its choices wait for it.
export type LayoutSlot = { mod: string; pane: string; title: string; rows?: number }

export const LAYOUT: {
  columns: number
  slots: LayoutSlot[]
  bands: string[]
  toasts: string[]
  status: string[]
} = {
  columns: 1,
  slots: [],
  bands: [],
  toasts: [],
  status: [],
}
