export class BudgetCategoryRequestCache<T> {
  private readonly values = new Map<string, readonly T[]>();
  private readonly requests = new Map<string, Promise<readonly T[]>>();

  get(key: string): readonly T[] | undefined {
    return this.values.get(key);
  }

  load(
    key: string,
    loader: () => Promise<readonly T[]>,
  ): Promise<readonly T[]> {
    const cached = this.values.get(key);
    if (cached) return Promise.resolve(cached);

    const inFlight = this.requests.get(key);
    if (inFlight) return inFlight;

    const request = loader()
      .then((value) => {
        this.values.set(key, value);
        return value;
      })
      .finally(() => this.requests.delete(key));
    this.requests.set(key, request);
    return request;
  }
}
