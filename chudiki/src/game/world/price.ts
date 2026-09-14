export type MoneyDeal = {
  price: number;
  list: number;
  from: boolean;
};

export function moneyDeal(price: number, list = 0): MoneyDeal {
  const pay = price > 0 ? price : 0;
  return { price: pay, list: list > pay && pay > 0 ? list : 0, from: false };
}

export function cheapestDeal(rows: readonly MoneyDeal[]): MoneyDeal {
  if (!rows.length) return { price: 0, list: 0, from: false };
  const min = Math.min(...rows.map((row) => row.price));
  const max = Math.max(...rows.map((row) => row.price));
  const anySale = rows.some((row) => row.list > row.price);
  const was = Math.max(...rows.map((row) => (row.list > row.price ? row.list : row.price)));
  return {
    price: min,
    list: anySale && was > min ? was : 0,
    from: min !== max,
  };
}
