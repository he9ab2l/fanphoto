import { Link, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Play } from 'lucide-react'
import type { Photo } from '@fanphoto/shared'
import { srcSet } from '../lib/api'
export function PhotoCard({ photo, index = 0 }: { photo: Photo; index?: number }) {
  const location = useLocation(),
    reduced = useReducedMotion()
  return (
    <motion.article
      className="photo-card"
      initial={reduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '100px' }}
      transition={{ duration: 0.42, delay: Math.min(index % 4, 3) * 0.04 }}
    >
      <Link
        to={`/photos/${photo.id}`}
        state={{ background: location }}
        className="photo-link"
        aria-label={`查看照片：${photo.title}`}
        style={{ backgroundColor: photo.analysis?.colors[0] || 'var(--placeholder)' }}
      >
        <img
          src={photo.urls.md}
          srcSet={srcSet(photo)}
          sizes="(max-width: 600px) 48vw, (max-width: 1100px) 31vw, 24vw"
          width={photo.width}
          height={photo.height}
          alt={photo.title}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
        />
        <div className="photo-overlay">
          <span>{photo.title}</span>
          <span className="mini-glass">
            <ArrowUpRight size={17} />
          </span>
        </div>
        {photo.videoUrl && (
          <span className="live-badge glass">
            <Play size={10} fill="currentColor" /> LIVE
          </span>
        )}
      </Link>
    </motion.article>
  )
}
