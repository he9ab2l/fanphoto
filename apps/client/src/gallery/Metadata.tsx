import type { Photo } from '@fanphoto/contracts'
import { captureLabel, exposure, formatBytes } from '../lib/photos'
import { Icon } from '../ui/icons'

function Facts({ rows }: { rows: [string, string | number | null | undefined][] }) {
  return (
    <dl className="metadata-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || '未记录'}</dd>
        </div>
      ))}
    </dl>
  )
}
export function Metadata({ photo }: { photo: Photo }) {
  const exif = photo.exif
  return (
    <div className="metadata">
      {photo.description && <p className="photo-description">{photo.description}</p>}
      <section>
        <h3>
          <Icon name="time" size={17} />
          拍摄
        </h3>
        <Facts
          rows={[
            ['时间', captureLabel(photo, true)],
            ['时区', photo.capturedOffset || '未记录'],
            ['地点', photo.location],
            ...(photo.latitude !== null && photo.longitude !== null
              ? [
                  ['坐标', `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`] as [
                    string,
                    string,
                  ],
                ]
              : []),
          ]}
        />
      </section>
      <section>
        <h3>
          <Icon name="camera" size={17} />
          器材与曝光
        </h3>
        <Facts
          rows={[
            ['品牌', exif.make],
            ['相机', exif.model],
            ['镜头', exif.lens],
            ['焦距', exif.focalLength ? `${exif.focalLength} mm` : null],
            ...(exif.focalLength35
              ? [['等效焦距', `${exif.focalLength35} mm`] as [string, string]]
              : []),
            ['光圈', exif.aperture ? `ƒ/${Number(exif.aperture.toFixed(1))}` : null],
            ['快门', exposure(exif)],
            ['ISO', exif.iso],
          ]}
        />
      </section>
      <section>
        <h3>
          <Icon name="file" size={17} />
          文件
        </h3>
        <Facts
          rows={[
            ['格式', photo.file.mime.replace('image/', '').toUpperCase()],
            ['尺寸', `${photo.file.width} × ${photo.file.height}`],
            ['大小', formatBytes(photo.file.bytes)],
            ...(photo.file.name ? [['文件名', photo.file.name] as [string, string]] : []),
            ...(exif.software ? [['软件', exif.software] as [string, string]] : []),
          ]}
        />
      </section>
      {(exif.artist || exif.copyright) && (
        <section>
          <h3>作者与版权</h3>
          <Facts
            rows={[
              ...(exif.artist ? [['作者', exif.artist] as [string, string]] : []),
              ...(exif.copyright ? [['版权', exif.copyright] as [string, string]] : []),
            ]}
          />
        </section>
      )}
      <section>
        <h3>标签</h3>
        {photo.tags.length ? (
          <div className="tags">
            {photo.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">未添加标签</p>
        )}
      </section>
      {photo.attribution && (
        <section className="attribution">
          <h3>来源与许可</h3>
          <p>{photo.attribution.author}</p>
          <a href={photo.attribution.sourceUrl} target="_blank" rel="noreferrer">
            查看作品来源
          </a>
          {photo.attribution.licenseUrl ? (
            <a href={photo.attribution.licenseUrl} target="_blank" rel="noreferrer">
              {photo.attribution.license}
            </a>
          ) : (
            <p>{photo.attribution.license}</p>
          )}
        </section>
      )}
    </div>
  )
}
