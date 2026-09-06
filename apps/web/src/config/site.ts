export const photoSite = {
  brand: 'Fanphoto',
  mark: 'FP',
  nav: [
    { to: '/', label: '照片', icon: 'grid-2-line' },
    { to: '/albums', label: '相册', icon: 'photo-album-line' },
    { to: '/map', label: '足迹', icon: 'map-line' },
    { to: '/about', label: '关于', icon: 'information-line' },
  ] as const,
  grid: {
    visibleColumns: 5,
    gap: 26,
    bow: 0.15,
    bulge: 0.25,
    reach: 1.5,
    flipFraction: 0.78,
    dampScroll: 0.1,
    dampDrag: 0.12,
    zoomMin: 0.65,
    zoomMax: 1.8,
    zoomStep: 0.15,
    tileEdge: 22,
  },
  viewer: {
    zoomMin: 1,
    zoomMax: 5,
    zoomStep: 0.5,
  },
} as const
