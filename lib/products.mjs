export const PRODUCTS = [
  {
    id: 'steam-controller',
    name: 'Steam Controller',
    packageIds: [1558609],
    packages: [{ id: 1558609, label: null, priceUsd: 99 }],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/9d5d7384c51cd831aaf52dd47184ecd3.avif',
    steamPath: '/hardware/steamcontroller/',
    blurb: 'Valve’s 2025 Steam Controller, $99 in the US. Steam takes reservations and emails you when your order can be placed.'
  },
  {
    id: 'steam-deck',
    name: 'Steam Deck',
    packageIds: [946113, 946114, 595604],
    packages: [
      { id: 946113, label: '512GB OLED', priceUsd: 789 },
      { id: 946114, label: '1TB OLED', priceUsd: 949 },
      // Steam lists no US price for the LCD model. Only Australia sells it new (A$649).
      { id: 595604, label: '256GB LCD', priceUsd: null }
    ],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/6163a5d5ee139c8c07485f6e72fba875.avif',
    steamPath: '/steamdeck/',
    blurb: 'Valve’s handheld PC. Sold new as the 512GB OLED and 1TB OLED, plus the 256GB LCD in some regions.'
  },
  {
    id: 'steam-dock',
    name: 'Steam Deck Dock',
    packageIds: [761892],
    packages: [{ id: 761892, label: null, priceUsd: 79 }],
    icon: 'https://clan.fastly.steamstatic.com/images/39049601/c871cb610cd4de7f2cd695c04613ec2f11a16f22.png',
    steamPath: '/steamdeckdock',
    blurb: 'Official Steam Deck Docking Station. Adds wired Ethernet, DisplayPort/HDMI, and USB-A passthrough.'
  },
  {
    id: 'steam-deck-refurbished',
    name: 'Steam Deck (Refurbished)',
    packageIds: [903905, 903906, 903907, 1202542, 1202547],
    packages: [
      { id: 903905, label: '64GB LCD', priceUsd: 279 },
      { id: 903906, label: '256GB LCD', priceUsd: 319 },
      { id: 903907, label: '512GB LCD', priceUsd: 359 },
      { id: 1202542, label: '512GB OLED', priceUsd: 629 },
      { id: 1202547, label: '1TB OLED', priceUsd: 759 }
    ],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/6163a5d5ee139c8c07485f6e72fba875.avif',
    steamPath: '/sale/steamdeckrefurbished',
    blurb: 'Valve Certified Refurbished Steam Decks, from $279 in the US. Valve restocks them in small batches.'
  },
  {
    id: 'steam-frame',
    name: 'Steam Frame',
    packageIds: [1629484, 1629486],
    packages: [
      { id: 1629484, label: '256GB Kit', priceUsd: 1059 },
      { id: 1629486, label: '1TB Kit', priceUsd: 1299 }
    ],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/82a194cce9b0912b2501236f4f4ef757.avif',
    steamPath: '/hardware/steamframe/',
    blurb: 'Valve’s VR headset, from $1,059 in the US. Steam sells it through a waitlist, and the Steam page shows the current order window.'
  },
  {
    id: 'steam-frame-ergonomic-kit',
    name: 'Steam Frame Ergonomic Accessories Kit',
    packageIds: [1727363],
    packages: [{ id: 1727363, label: null, priceUsd: 59 }],
    icon: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4978440/17b05743f9d57198d8d4117a4623bfd4714c9f8b/header.jpg',
    steamPath: '/app/4978440/Steam_Frame_Ergonomic_Accessories_Kit/',
    blurb: 'Hand straps, top strap and extended light blocker for Steam Frame, $59 in the US. Sold on Steam with free shipping where Valve sells Frame.'
  },
  {
    id: 'steam-hardware-power-supply',
    name: 'Steam Hardware Power Supply Unit',
    packageIds: [1727369],
    packages: [{ id: 1727369, label: null, priceUsd: 29 }],
    icon: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4978480/f7a4bef871f21fa74edde91cab66c72ab5753e18/header.jpg',
    steamPath: '/app/4978480/Steam_Hardware_Power_Supply_Unit/',
    blurb: 'Valve’s 45W USB-C PD power supply with a 2.5m cable, $29 in the US. The Steam Frame ships without one, and it is also the Steam Deck charger option on Steam.'
  },
  {
    id: 'steam-machine',
    name: 'Steam Machine',
    packageIds: [1629447, 1629446, 1629458, 1629460],
    packages: [
      { id: 1629447, label: '512GB', priceUsd: 1049 },
      { id: 1629446, label: '2TB', priceUsd: 1349 },
      { id: 1629458, label: '512GB with Controller', priceUsd: 1128 },
      { id: 1629460, label: '2TB with Controller', priceUsd: 1428 }
    ],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/d3888f2e560b3a837f6f0a25345b03b6.avif',
    steamPath: '/hardware/steammachine/',
    blurb: 'Valve’s living room PC, from $1,049 in the US, with bundles that include a Steam Controller. Steam sells it through a waitlist.'
  }
];

export const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'PE', name: 'Peru' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'JP', name: 'Japan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'IL', name: 'Israel' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'ZA', name: 'South Africa' }
];

// Regions where Steam reports allow_purchase_in_country for Valve hardware.
// Checked with a one-off GetHardwareItems run over every region on 13 Oct 2026.
// JP, KR, HK and TW are sold through Komodo Station, not Steam.
export const VALVE_SELLS = [
  'US', 'CA', 'GB', 'IE', 'AU',
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

export function productById(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

export function regionByCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  return REGIONS.find((r) => r.code === upper) || null;
}

export function isCheckable(product) {
  return Array.isArray(product?.packageIds) && product.packageIds.length > 0;
}
