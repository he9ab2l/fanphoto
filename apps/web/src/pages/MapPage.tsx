import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin, X, ArrowUpRight } from 'lucide-react'
import type { Photo } from '@fanphoto/shared'
import { api } from '../lib/api'
import { Empty, ErrorState, IconButton, Spinner } from '../components/ui'
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
              tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#e6ebe7' } },
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
          'circle-color': '#1a665b',
          'circle-radius': ['step', ['get', 'point_count'], 21, 10, 28, 50, 35],
          'circle-stroke-width': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.8,
        },
      })
      instance.addLayer({
        id: 'points',
        type: 'circle',
        source: 'photos',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#1a665b',
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
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
      <div className="map-heading glass">
        <MapPin size={18} />
        <h1>足迹</h1>
        <span>{result.data?.photos.length || 0}</span>
      </div>
      <div className="map-canvas" ref={container} aria-label="照片拍摄地点地图" />
      {result.isPending && (
        <div className="map-empty">
          <Spinner />
        </div>
      )}
      {result.isError && (
        <div className="map-empty glass">
          <ErrorState error={result.error} retry={() => void result.refetch()} />
        </div>
      )}
      {result.data && !result.data.photos.length && (
        <div className="map-empty glass">
          <Empty
            title={result.data.enabled ? '足迹，留给下一次出发' : '位置信息未公开'}
            detail={result.data.enabled ? '带有 GPS 的照片会出现在这里' : undefined}
          />
        </div>
      )}
      {failed && (
        <span className="map-notice glass" role="status">
          底图暂不可用，照片列表仍可浏览
        </span>
      )}
      {!!result.data?.photos.length && (
        <aside className="map-photo-list glass" aria-label="地点列表">
          {result.data.photos.map((photo) => (
            <button
              key={photo.id}
              className={selected?.id === photo.id ? 'selected' : ''}
              onClick={() => focus(photo)}
            >
              <img src={photo.urls.sm} alt="" loading="lazy" />
              <span>
                {photo.title}
                <small>
                  {photo.location ||
                    `${photo.latitude?.toFixed(2)}, ${photo.longitude?.toFixed(2)}`}
                </small>
              </span>
              <MapPin size={15} />
            </button>
          ))}
        </aside>
      )}
      {selected && (
        <div className="map-preview glass">
          <IconButton label="关闭地点预览" onClick={() => setSelected(null)}>
            <X size={17} />
          </IconButton>
          <Link to={`/photos/${selected.id}`} state={{ background: location }}>
            <img src={selected.urls.md} alt={selected.title} />
            <span>
              {selected.title}
              <ArrowUpRight size={17} />
            </span>
          </Link>
        </div>
      )}
    </section>
  )
}
