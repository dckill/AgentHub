export class HistoryPaginationGate {
    private waitingForUserGesture = false;

    tryStart(options: { hasMore: boolean; isLoading: boolean }): boolean {
        if (!options.hasMore || options.isLoading || this.waitingForUserGesture) {
            return false;
        }
        this.waitingForUserGesture = true;
        return true;
    }

    onUserGesture(options: { isLoading: boolean }): void {
        if (!options.isLoading) {
            this.waitingForUserGesture = false;
        }
    }

    reset(): void {
        this.waitingForUserGesture = false;
    }
}
