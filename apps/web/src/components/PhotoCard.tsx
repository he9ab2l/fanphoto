import { Link, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Play } from 'lucide-react'
import type { Photo } from '@fanphoto/shared'
import { srcSet, shortDate } from '../lib/api'

export function PhotoCard({ photo, index = 0 }: { photo: Photo; index?: number }) {
  const location = useLocation()
  const reduced = useReducedMotion()
  return (
    <motion.article className="photo-card" initial={reduced ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '100px' }} transition={{ duration: 0.45, delay: Math.min(index % 4, 3) * 0.045 }}>
      <Link to={`/photos/${photo.id}`} state={{ background: location }} className="photo-link" aria-label={`查看照片：${photo.title}`} style={{ backgroundColor: photo.analysis?.colors[0] || '#dedbd2' }}>
        <div className="photo-index">{String(index + 1).padStart(2, '0')}</div>
        <img src={photo.urls.md} srcSet={srcSet(photo)} sizes="(max-width: 600px) 94vw, (max-width: 1100px) 46vw, 31vw" width={photo.width} height={photo.height} alt={photo.title} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" />
        <div className="photo-overlay"><span className="photo-caption"><strong>{photo.title}</strong><small>{shortDate(photo.takenAt)}</small></span><span className="photo-arrow"><ArrowUpRight size={18} /></span></div>
        {photo.videoUrl && <span className="live-badge"><Play size={9} fill="currentColor" /> LIVE</span>}
      </Link>
    </motion.article>
  )
}
