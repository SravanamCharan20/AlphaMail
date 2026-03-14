import IORedis from "ioredis";

const CHANNEL = "socket-events";

let publisher;
let subscriber;

const getRedisOptions = () => ({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

const getPublisher = () => {
  if (!publisher) {
    publisher = new IORedis(getRedisOptions());
  }
  return publisher;
};

export const publishSocketEvent = async (event, payload, room) => {
  const message = JSON.stringify({ event, payload, room });
  await getPublisher().publish(CHANNEL, message);
};

export const initSocketSubscriber = (io) => {
  if (subscriber) return;
  subscriber = new IORedis(getRedisOptions());

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
