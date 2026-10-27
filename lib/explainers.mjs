// "Status explained" boxes on product pages. Hand-written. The Frame and
// Machine reservation rules were checked against their Steam store FAQs on
// 13 Oct 2026. Recheck them when Valve changes how a product is sold. An entry
// with its own `verifiedOn` was checked on that day instead.
export const VERIFIED_ON = '2026-10-13';

const DIRECT = (name) => ({
  summary: `Steam sells the ${name} directly. There is no queue.`,
  points: [
    'In stock means you can add it to your cart on the Steam store right now.',
    'Out of stock means Steam shows no units for your country. Stock can come back at any time, so an alert is the easiest way to catch it.',
    'Prices and stock are per country. A model can be in stock in one country and out in another.'
  ]
});

export const EXPLAINERS = {
  'steam-deck': { ...DIRECT('Steam Deck'), source: 'https://store.steampowered.com/steamdeck/' },
  'steam-dock': { ...DIRECT('Steam Deck Dock'), source: 'https://store.steampowered.com/steamdeckdock' },
  'steam-frame-ergonomic-kit': { ...DIRECT('Steam Frame Ergonomic Accessories Kit'), source: 'https://store.steampowered.com/app/4978440/Steam_Frame_Ergonomic_Accessories_Kit/' },
  'steam-hardware-power-supply': { ...DIRECT('Steam Hardware Power Supply Unit'), source: 'https://store.steampowered.com/app/4978480/Steam_Hardware_Power_Supply_Unit/', verifiedOn: '2026-10-26' },
  'valve-index': {
    summary: 'Valve no longer makes the Valve Index. Steam sells the remaining stock at 20% off while supplies last.',
    points: [
      'Valve\'s page says: "Valve Index is no longer being produced. Remaining Index headsets, controllers, and accessories are still available at the new prices below while supplies last."',
      'Each part is tracked on its own. A country shows "4 of 9 parts in stock" when only some parts have stock, and the table below names them.',
      'Out of stock may be final. Valve has not said it will make more, so a part that sells out may not come back.'
    ],
    source: 'https://store.steampowered.com/hardware/valveindex',
    verifiedOn: '2026-10-26'
  },
  'steam-deck-refurbished': {
    summary: 'Valve sells certified refurbished Steam Decks in small batches when it has them.',
    points: [
      'In stock means a batch is on sale now for your country. Batches tend to sell out quickly.',
      'Out of stock is the normal state between batches.',
      'Each model is tracked on its own, so one storage size can be available while another is not.'
    ],
    source: 'https://store.steampowered.com/sale/steamdeckrefurbished'
  },
  'steam-controller': {
    summary: 'The Steam Controller is sold through reservations.',
    points: [
      'Reservations open means you can reserve one on the Steam store now.',
      'Steam emails you when your order can be placed. Follow the instructions in that email.',
      'After that email you have 72 hours to order. Valve confirmed this in its 18 June 2026 reservations update.',
      'In stock means Steam lets you buy one straight away, without a reservation.'
    ],
    source: 'https://store.steampowered.com/hardware/steamcontroller/',
    update: { date: '2026-06-18', title: 'Steam Controller: Reservations update', url: 'https://store.steampowered.com/news/group/45479024/view/697641379212297809' }
  },
  'steam-frame': {
    summary: 'Steam Frame is sold through a reservation queue, with a waitlist behind it.',
    points: [
      'A reservation means a unit is set aside for you. Valve emails you when it is ready to ship.',
      'After that email you have 72 hours to buy it. If you do not, the reservation is cancelled and goes to the next person in the queue.',
      'Waitlist means your place came after the units Valve has to offer right now. You move into the queue if people ahead of you cancel, and future production runs go to the waitlist in order.',
      'Joining after the queue was drawn puts you at the end of the waitlist.'
    ],
    source: 'https://store.steampowered.com/hardware/steamframe/'
  },
  'steam-machine': {
    summary: 'Steam Machine is sold through a reservation queue, with a waitlist behind it.',
    points: [
      'A reservation means a unit is set aside for you. Valve emails you when it is ready to ship.',
      'After that email you have 72 hours to buy it. If you do not, the reservation is cancelled and goes to the next person in the queue.',
      'Waitlist means your place came after the units in the current production run. You can still move up if people ahead of you cancel, and later runs go to the waitlist in order.',
      'Joining after the queue was drawn puts you at the end of the waitlist.'
    ],
    source: 'https://store.steampowered.com/hardware/steammachine/'
  }
};

export function explainerFor(product) {
  return EXPLAINERS[product?.id] || null;
}
