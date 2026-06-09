export interface PushProvider {
  send(subscriptionJson: string, payload: any): Promise<any>;
}
