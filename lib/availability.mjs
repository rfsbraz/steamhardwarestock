// Where Valve sells each product outside the Steam store, from the FAQ on
// each product's Steam page (checked 13 Oct 2026). Recheck when Valve changes
// a launch. Only add a note that Valve's page states.
const ALL_KOMODO = ['JP', 'KR', 'HK', 'TW'];

export const AVAILABILITY = {
  'steam-deck': { komodo: ALL_KOMODO, notes: {}, source: 'https://store.steampowered.com/steamdeck/' },
  'steam-controller': { komodo: ALL_KOMODO, notes: {}, source: 'https://store.steampowered.com/hardware/steamcontroller/' },
  'steam-frame': { komodo: ['JP', 'TW', 'HK'], notes: { KR: 'later' }, source: 'https://store.steampowered.com/hardware/steamframe/' },
  'steam-machine': { komodo: ['JP', 'TW', 'HK'], notes: { KR: 'not-sold' }, source: 'https://store.steampowered.com/hardware/steammachine/' }
};

// { kind: 'komodo' | 'note' | 'none', note?, source? } for a product outside VALVE_SELLS.
export function availabilityFor(product, regionCode) {
  const a = AVAILABILITY[product?.id];
  if (!a) return { kind: 'none' };
  if (a.komodo.includes(regionCode)) return { kind: 'komodo', source: a.source };
  if (a.notes[regionCode]) return { kind: 'note', note: a.notes[regionCode], source: a.source };
  return { kind: 'none' };
}
