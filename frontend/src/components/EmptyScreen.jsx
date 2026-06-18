export default function EmptyScreen({
  title,
  description,
  detailLabel,
  detail
}) {
  return (
    <div className="screen active" id="empty-screen">
      <div className="logo-mark">VC</div>
      <div className="headline">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="info-card">
        <h2>{detailLabel}</h2>
        <code>{detail}</code>
      </div>
      <div className="info-card">
        <h2>Supported files</h2>
        <p>PNG, JPG, JPEG, WEBP, and GIF.</p>
      </div>
    </div>
  );
}
