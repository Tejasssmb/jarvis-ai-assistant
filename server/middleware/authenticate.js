import jwt from "jsonwebtoken";
import Device from "../models/Device.js";

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const device = await Device.findOne({
      deviceId: decoded.deviceId,
      trusted: true,
    });

    if (!device) {
      return res.status(401).json({ message: "Device not trusted" });
    }

    req.device = device;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default authenticate;