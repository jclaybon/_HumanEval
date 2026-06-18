export default function LoadingScreen({ title, description }) {
  return (
    <div className="screen active" id="loading-screen">
      <div className="logo-mark">VC</div>
      <div className="headline">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
