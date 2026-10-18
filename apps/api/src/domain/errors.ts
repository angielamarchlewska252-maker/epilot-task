export class ActiveGuessError extends Error {
  constructor() {
    super("You already have an active prediction.");
    this.name = "ActiveGuessError";
  }
}

export class PlayerNotFoundError extends Error {
  constructor() {
    super("Unknown player session.");
    this.name = "PlayerNotFoundError";
  }
}

export class PriceUnavailableError extends Error {
  constructor(message = "Bitcoin price is temporarily unavailable.") {
    super(message);
    this.name = "PriceUnavailableError";
  }
}
