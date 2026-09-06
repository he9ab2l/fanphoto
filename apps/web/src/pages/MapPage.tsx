import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Photo } from '@fanphoto/shared'
import { api } from '../lib/api'
import { Icon } from '../lib/icons'
import { GlassIconButton } from '../components/public/controls'

export default function MapPage() {
  const result = useQuery({
      queryKey: ['map'],
      queryFn: () => api<{ photos: Photo[]; enabled: boolean }>('/photos/map'),
    }),
    container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    location = useLocation()
  const [selected, setSelected] = useState<Photo | null>(null),
    [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!container.current || !result.data) return
    const photos = result.data.photos
    let instance: maplibregl.Map
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [103, 30],
        zoom: 2,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            base: {
              type: 'raster',
              tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#0b0b0c' } },
            { id: 'base', type: 'raster', source: 'base' },
          ],
        },
      })
    } catch {
      setFailed(true)
      return
    }
    map.current = instance
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.on('error', () => setFailed(true))
    instance.on('load', () => {
      instance.addSource('photos', {
        type: 'geojson',
        cluster: true,
        clusterRadius: 42,
        data: {
          type: 'FeatureCollection',
          features: photos.map((photo) => ({
            type: 'Feature',
            properties: { id: photo.id },
            geometry: { type: 'Point', coordinates: [photo.longitude!, photo.latitude!] },
          })),
        },
      })
      instance.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'photos',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3a3a3c',
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 28, 50, 36],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      instance.addLayer({
        id: 'points',
        type: 'circle',
        source: 'photos',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#f2f2f2',
          'circle-radius': 8,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#000000',
        },
      })
      instance.on('click', 'points', (event) => {
        const id = event.features?.[0]?.properties?.id
        setSelected(photos.find((p) => p.id === id) || null)
      })
      instance.on('click', 'clusters', async (event) => {
        const feature = event.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const zoom = await (
          instance.getSource('photos') as maplibregl.GeoJSONSource
        ).getClusterExpansionZoom(Number(feature.properties?.cluster_id))
        instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom })
      })
      for (const layer of ['points', 'clusters']) {
        instance.on('mouseenter', layer, () => {
          instance.getCanvas().style.cursor = 'pointer'
        })
        instance.on('mouseleave', layer, () => {
          instance.getCanvas().style.cursor = ''
        })
      }
      if (photos.length) {
        const bounds = new maplibregl.LngLatBounds()
        photos.forEach((p) =>
          bounds.extend([p.longitude!, Math.min(85, Math.max(-85, p.latitude!))]),
        )
        instance.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 0 })
      }
    })
    return () => {
      instance.remove()
      map.current = null
    }
  }, [result.data])

  const focus = (photo: Photo) => {
    setSelected(photo)
    map.current?.flyTo({
      center: [photo.longitude!, Math.min(85, Math.max(-85, photo.latitude!))],
      zoom: 10,
    })
  }

  return (
    <section className="map-page">
      <div className="map-heading liquid">
        <Icon icon="mingcute:map-line" width={18} height={18} />
        <span>{result.data?.photos.length || 0}</span>
      </div>
      <div className="map-canvas" ref={container} aria-label="照片拍摄地点地图" />
      {result.isPending && (
        <div className="map-empty liquid">
          <span className="dot-pulse" />
        </div>
      )}
      {result.isError && (
        <div className="map-empty liquid">
          <p>足迹暂时无法加载</p>
          <button className="liquid pill-btn" onClick={() => void result.refetch()}>
            重试
          </button>
        </div>
      )}
      {result.data && !result.data.photos.length && (
        <div className="map-empty liquid">
          <p>{result.data.enabled ? '足迹，留给下一次出发' : '位置信息未公开'}</p>
        </div>
      )}
      {failed && (
        <span className="map-notice liquid" role="status">
          底图暂不可用
        </span>
      )}
      {!!result.data?.photos.length && (
        <aside className="map-photo-list liquid" aria-label="地点列表">
          {result.data.photos.map((photo) => (
            <button
              key={photo.id}
              className={selected?.id === photo.id ? 'selected' : ''}
              onClick={() => focus(photo)}
              aria-label={photo.title}
            >
              <img src={photo.urls.sm} alt="" loading="lazy" />
            </button>
          ))}
        </aside>
      )}
      {selected && (
        <div className="map-preview liquid">
          <GlassIconButton
            label="关闭地点预览"
            icon="close-line"
            onClick={() => setSelected(null)}
          />
          <Link to={`/photos/${selected.id}`} state={{ background: location }}>
            <img src={selected.urls.md} alt={selected.title} />
            <span>{selected.title}</span>
          </Link>
        </div>
      )}
    </section>
  )
}
