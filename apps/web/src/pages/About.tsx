import { Link } from 'react-router-dom'
import { usePhotos, useSite } from '../lib/api'
import { Icon } from '../lib/icons'

export default function About() {
  const site = useSite(),
    photos = usePhotos({ limit: '1', featured: 'true' }),
    photo = photos.data?.pages[0]?.photos[0]
  return (
    <section className="about-page">
      {photo && <img className="about-backdrop" src={photo.urls.lg} alt="" />}
      <div className="about-scrim" />
      <article className="about-card liquid">
        <h1>{site.data?.site.title || 'Fanphoto'}</h1>
        <p>{site.data?.site.bio || site.data?.site.slogan || ''}</p>
        <Link className="liquid pill-btn" to="/" aria-label="返回照片墙">
          <Icon icon="mingcute:arrow-left-line" width={17} height={17} />
          照片
        </Link>
      </article>
    </section>
  )
}
