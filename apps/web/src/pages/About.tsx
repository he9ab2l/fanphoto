import { Link } from 'react-router-dom'
import { Camera, MapPin, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { usePhotos, useSite } from '../lib/api'
import { ErrorState, External, Spinner } from '../components/ui'
export default function About() {
  const result = useSite(),
    photos = usePhotos({ featured: 'true', limit: '4' }),
    frames = photos.data?.pages[0].photos || []
  if (result.isPending)
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    )
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />
  const { site, stats } = result.data
  return (
    <section className="about-page page-container">
      <div className="about-collage" aria-hidden="true">
        {frames.slice(0, 3).map((photo, index) => (
          <motion.img
            key={photo.id}
            src={photo.urls.md}
            alt=""
            initial={{ opacity: 0, rotate: 0, y: 20 }}
            animate={{ opacity: 1, rotate: [-12, 6, 16][index], y: 0 }}
            transition={{ delay: index * 0.1, type: 'spring', stiffness: 80, damping: 18 }}
          />
        ))}
        {!frames.length && <Camera size={64} strokeWidth={1} />}
      </div>
      <div className="about-card glass">
        <span className="eyebrow">BEHIND THE FRAMES</span>
        <h1>{site.author}</h1>
        {site.location && (
          <span className="about-location">
            <MapPin size={15} />
            {site.location}
          </span>
        )}
        <p className="about-bio">{site.bio}</p>
        <div className="about-stats">
          <span>
            <strong>{stats.photos}</strong>照片
          </span>
          <span>
            <strong>{stats.albums}</strong>相册
          </span>
          <span>
            <strong>{stats.locations}</strong>足迹
          </span>
        </div>
        <div className="about-links">
          {site.website && <External href={site.website}>主页</External>}
          {site.instagram && <External href={site.instagram}>Instagram</External>}
          <Link className="button primary" to="/">
            看照片 <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
