import { createRedisConnection } from "../config/redis.js";

const CHANNEL = "socket-events";

let publisher;
let subscriber;

const getPublisher = () => {
  if (!publisher) {
    publisher = createRedisConnection();
  }
  return publisher;
};

export const publishSocketEvent = async (event, payload, room) => {
  const message = JSON.stringify({ event, payload, room });
  await getPublisher().publish(CHANNEL, message);
};

export const initSocketSubscriber = (io) => {
  if (subscriber) return;
  subscriber = createRedisConnection();

  subscriber.subscribe(CHANNEL, (err) => {
    if (err) {
      console.error("Socket event subscribe failed:", err);
    }
  });

  subscriber.on("message", (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const { event, payload, room } = JSON.parse(message);
      if (room) {
        io.to(room).emit(event, payload);
      } else {
        io.emit(event, payload);
      }
    } catch (error) {
      console.error("Invalid socket event payload:", error);
    }
  });
};
