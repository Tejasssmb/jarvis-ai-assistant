import "./ArcReactor.css";

export default function ArcReactor({ state }) {
  return (
    <div className={`arc-reactor ${state}`}>

      <div className="outer-ring"></div>

      <div className="middle-ring"></div>

      <div className="inner-ring"></div>

      <div className="core"></div>

    </div>
  );
}