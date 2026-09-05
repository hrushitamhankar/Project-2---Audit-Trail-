const cacheService = require("../src/services/cacheService");

describe("In-Memory Read Model Cache Service", () => {
  beforeEach(() => {
    cacheService.clear();
  });

  test("stores and retrieves cached read models", () => {
    const dummyRecord = { shipmentId: "SHP-CACHE-1", currentStatus: "CREATED" };
    cacheService.set("SHP-CACHE-1", dummyRecord);

    expect(cacheService.get("SHP-CACHE-1")).toEqual(dummyRecord);
  });

  test("invalidates cached entries correctly", () => {
    cacheService.set("SHP-CACHE-2", { shipmentId: "SHP-CACHE-2" });
    cacheService.invalidate("SHP-CACHE-2");

    expect(cacheService.get("SHP-CACHE-2")).toBeNull();
  });

  test("tracks cached item counts accurately", () => {
    cacheService.set("SHP-A", { id: "SHP-A" });
    cacheService.set("SHP-B", { id: "SHP-B" });

    expect(cacheService.size()).toBe(2);
    cacheService.clear();
    expect(cacheService.size()).toBe(0);
  });
});