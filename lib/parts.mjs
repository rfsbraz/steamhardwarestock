import StockStatus from '../public/stock-status.js';

// Status words for one product in one country. A product sold as parts (the
// Valve Index) is "In stock" when any part is, so it says how many instead.
export function statusText(product, cell, status = cell?.status) {
  if (product.parts && status === 'in_stock') {
    const pkgs = cell?.packages;
    return (pkgs && StockStatus.partsLabel(product.packageIds.map((id) => pkgs.find((p) => p.id === id)?.status))) || 'Some parts in stock';
  }
  return status ? StockStatus.copyFor(status).label : 'Not checked yet';
}
