import { images } from './data/images'
import { GalleryWall } from './features/gallery/GalleryWall'

export function App() {
  return <GalleryWall images={images} />
}
