export interface EmailProvider {
  send(to: string, subject: string, htmlContent: string): Promise<any>;
}
