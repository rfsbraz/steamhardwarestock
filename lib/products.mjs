export const PRODUCTS = [
  {
    id: 'steam-controller',
    name: 'Steam Controller',
    packageIds: [1558609],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/9d5d7384c51cd831aaf52dd47184ecd3.avif',
    steamPath: '/hardware/steamcontroller/',
    blurb: 'Valve’s 2025 Steam Controller. Officially sold via the Steam Store in supported countries.'
  },
  {
    id: 'steam-deck',
    name: 'Steam Deck',
    packageIds: [946113, 946114],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/6163a5d5ee139c8c07485f6e72fba875.avif',
    steamPath: '/steamdeck/',
    blurb: 'Valve’s handheld PC. Sold in 512GB OLED and 1TB OLED variants on the Steam Store.'
  },
  {
    id: 'steam-dock',
    name: 'Steam Deck Dock',
    packageIds: [761892],
    icon: 'https://clan.fastly.steamstatic.com/images/39049601/c871cb610cd4de7f2cd695c04613ec2f11a16f22.png',
    steamPath: '/steamdeckdock',
    blurb: 'Official Steam Deck Docking Station. Adds wired Ethernet, DisplayPort/HDMI, and USB-A passthrough.'
  },
  {
    id: 'steam-frame',
    name: 'Steam Frame',
    packageIds: [],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/82a194cce9b0912b2501236f4f4ef757.avif',
    steamPath: '/hardware/steamframe/',
    blurb: 'Valve’s next-generation VR headset. Not yet available for purchase.'
  },
  {
    id: 'steam-machine',
    name: 'Steam Machine',
    packageIds: [],
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/d3888f2e560b3a837f6f0a25345b03b6.avif',
    steamPath: '/hardware/steammachine/',
    blurb: 'Valve’s 2025 Steam Machine console. Not yet available for purchase.'
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
