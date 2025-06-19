



class serverMemory {
    private memory: { [key: string]: any } = {};

    private keyCounter: number = 0;

    constructor() {}

    // Put a value into the server memory
    put(value: any): void {
        // Generate a unique key for the value
        const key = this.keyCounter++;
        this.memory[key] = value;
    }

    // Get a value from the server memory
    get(key: string): any {
        return this.memory[key];
    }

    // Clear the server memory
    clear(): void {
        this.memory = {};
    }

    // Remove a specific key from the server memory
    remove(key: string): void {
        delete this.memory[key];
    }

    // Get all values from the server memory
    getAll(): { [key: string]: any } {
        return { ...this.memory };
    }
}

export const createServerMemory = (): serverMemory => {
    return new serverMemory();
}