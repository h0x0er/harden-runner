export const STEPSECURITY_ENV = "int"; // agent or int

export const STEPSECURITY_API_URL = `https://${STEPSECURITY_ENV}.api.stepsecurity.io/v1`;

export const STEPSECURITY_WEB_URL = `https://${
  STEPSECURITY_ENV === "int" ? "int1" : "app"
}.stepsecurity.io`;
