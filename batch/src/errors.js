export class SelectionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SelectionError';
    this.code = code;
  }
}

export class BatchStop extends Error {
  constructor(code) {
    super(code);
    this.name = 'BatchStop';
    this.code = code;
  }
}

export class ComparisonError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ComparisonError';
    this.code = code;
  }
}
