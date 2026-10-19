import React from "react";

// Shows the real error instead of a blank white page if any screen crashes.
export default class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("UI crash:", err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div dir="rtl" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif", maxWidth: 640, margin: "10vh auto", padding: 24, background: "#fff", border: "1px solid #f3c1c1", borderRadius: 16 }}>
        <h2 style={{ margin: "0 0 8px", color: "#b42318" }}>خطا در نمایش صفحه</h2>
        <p style={{ margin: "0 0 12px", color: "#475467" }}>این پیام را برای پشتیبانی بفرستید:</p>
        <pre dir="ltr" style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 12, borderRadius: 10, fontSize: 12 }}>{String(this.state.err?.stack || this.state.err)}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, border: 0, background: "#0b2a4a", color: "#fff", cursor: "pointer" }}>بارگذاری مجدد</button>
      </div>
    );
  }
}
