import { useState } from "react";
import axios from "axios";
import { saveToken } from "../services/auth/authService";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
const [otp, setOtp] = useState("");
const [otpSent, setOtpSent] = useState(false);
const navigate = useNavigate();
const { setAuthenticated } = useAuth();

  const sendOtp = async () => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/user/send-otp",
        {
          email,
        }
      );

      setMessage(res.data.message);
      setOtpSent(true);

    } catch (err) {

      setMessage(
        err.response?.data?.message || "Something went wrong"
      );

    }
  };
  const verifyOtp = async () => {
  try {

    const res = await axios.post(
      "http://localhost:5000/api/user/verify-otp",
      {
        email,
        otp,
      }
    );

    saveToken(res.data.token);
    setAuthenticated(true);
    navigate("/");

  } catch (err) {

    setMessage(
      err.response?.data?.message || "Verification failed"
    );

  }
};

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: "15px",
      }}
    >
      <h1>JARVIS Login</h1>

      <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          padding: "10px",
          width: "300px",
        }}
      />

      <button onClick={sendOtp}>
        Send OTP
      </button>
      {otpSent && (
  <>
    <input
      type="text"
      placeholder="Enter OTP"
      value={otp}
      onChange={(e) => setOtp(e.target.value)}
      style={{
        padding: "10px",
        width: "300px",
      }}
    />

    <button onClick={verifyOtp}>
      Verify OTP
    </button>
  </>
)}

      <p>{message}</p>
    </div>
  );
}