/**
 * Email Service
 * 
 * Handles email notifications for successful transactions, no subscriptions,
 * and summary reports across multiple chains.
 */

import { Resend } from 'resend';
import { Logger } from '../utils/logger.js';
import { formatAddress, formatTxHash } from '../utils/helpers.js';

export class EmailService {
  constructor() {
    this.resend = null;
    this.logger = new Logger('EmailService');
    this.isConfigured = false;
    this.initialize();
  }

  /**
   * Initialize email service
   */
  initialize() {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      const notificationEmail = process.env.NOTIFICATION_EMAIL;
      const senderAddress = process.env.SENDER_ADDRESS;

      if (!apiKey || !notificationEmail) {
        this.logger.warn('Email configuration incomplete - notifications will be disabled');
        return;
      }

      this.resend = new Resend(apiKey);
      this.notificationEmail = notificationEmail;
      this.senderAddress = senderAddress || 'onboarding@resend.dev';
      this.isConfigured = true;

      this.logger.info('Email service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email service', error);
    }
  }

  /**
   * Send success email notification
   * @param {string} chainDisplayName - Chain display name
   * @param {string} txHash - Transaction hash
   * @param {string} balanceBeforeEth - ETH balance before
   * @param {string} balanceAfterEth - ETH balance after
   * @param {string} balanceBeforeUsdc - USDC balance before
   * @param {string} balanceAfterUsdc - USDC balance after
   * @param {number} recursionDepth - Recursion depth
   * @returns {Promise<Object|null>} Email result or null if not configured
   */
  async sendSuccessEmail(chainDisplayName, txHash, balanceBeforeEth, balanceAfterEth, balanceBeforeUsdc, balanceAfterUsdc, recursionDepth) {
    if (!this.isConfigured) {
      this.logger.info('Email configuration not available, skipping success email notification');
      return null;
    }

    try {
      const subject = `✅ Clocktower Remit Success - ${chainDisplayName}`;
      const explorerUrl = this.getExplorerUrl(chainDisplayName, txHash);
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">🎉 Clocktower Remit Transaction Successful!</h2>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">Transaction Details</h3>
            <p><strong>Chain:</strong> ${chainDisplayName}</p>
            <p><strong>Transaction Hash:</strong> <a href="${explorerUrl}" target="_blank" style="color: #0369a1;">${formatTxHash(txHash)}</a></p>
            <p><strong>Recursion Depth:</strong> ${recursionDepth}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #166534; margin-top: 0;">Balance Changes</h3>
            <p><strong>ETH Balance:</strong> ${balanceBeforeEth} → ${balanceAfterEth}</p>
            <p><strong>USDC Balance:</strong> ${balanceBeforeUsdc} → ${balanceAfterUsdc}</p>
          </div>
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;"><strong>Note:</strong> This email was sent automatically when the remit transaction succeeded and was not reverted.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainDisplayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await this.resend.emails.send({
        from: this.senderAddress,
        to: [this.notificationEmail],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        this.logger.error('Email error', error);
        throw new Error(`Email error: ${error.message}`);
      }

      this.logger.info(`Success email sent: ${data.id}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to send success email', error);
      throw error;
    }
  }

  /**
   * Send no subscriptions email notification
   * @param {string} chainDisplayName - Chain display name
   * @param {number} currentDay - Current day
   * @param {number} nextUncheckedDay - Next unchecked day
   * @returns {Promise<Object|null>} Email result or null if not configured
   */
  async sendNoSubscriptionsEmail(chainDisplayName, currentDay, nextUncheckedDay) {
    if (!this.isConfigured) {
      this.logger.info('Email configuration not available, skipping no subscriptions email notification');
      return null;
    }

    try {
      const subject = `📭 Clocktower No Subscriptions - ${chainDisplayName}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">📭 No Subscriptions Found for Today</h2>
          
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #92400e; margin-top: 0;">Daily Check Results</h3>
            <p><strong>Chain:</strong> ${chainDisplayName}</p>
            <p><strong>Current Day:</strong> ${currentDay}</p>
            <p><strong>Next Unchecked Day:</strong> ${nextUncheckedDay}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">What This Means</h3>
            <p>No active subscriptions were found for the current day. This could mean:</p>
            <ul style="color: #0369a1;">
              <li>No subscriptions are due today</li>
              <li>All subscriptions for today have already been processed</li>
              <li>The system is up to date</li>
            </ul>
          </div>
          
          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #166534;"><strong>Status:</strong> No remit transaction was needed or executed.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainDisplayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await this.resend.emails.send({
        from: this.senderAddress,
        to: [this.notificationEmail],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        this.logger.error('No subscriptions email error', error);
        throw new Error(`Email error: ${error.message}`);
      }

      this.logger.info(`No subscriptions email sent: ${data.id}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to send no subscriptions email', error);
      throw error;
    }
  }

  /**
   * Send error email notification
   * @param {string} chainDisplayName - Chain display name
   * @param {string} errorMessage - Error message
   * @param {string} errorType - Error type (e.g., 'PreCheck Error', 'Transaction Failure')
   * @param {Object} additionalDetails - Additional error details
   * @returns {Promise<Object|null>} Email result or null if not configured
   */
  async sendErrorEmail(chainDisplayName, errorMessage, errorType, additionalDetails = {}) {
    if (!this.isConfigured) {
      this.logger.info('Email configuration not available, skipping error email notification');
      return null;
    }

    try {
      const subject = `❌ Clocktower Error - ${chainDisplayName}`;
      
      // Build additional details HTML
      let additionalDetailsHtml = '';
      if (Object.keys(additionalDetails).length > 0) {
        additionalDetailsHtml = `
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">Additional Details</h3>
            ${Object.entries(additionalDetails).map(([key, value]) => 
              `<p><strong>${key}:</strong> ${value !== null && value !== undefined ? value : 'N/A'}</p>`
            ).join('')}
          </div>
        `;
      }

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">❌ Clocktower Execution Error</h2>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #991b1b; margin-top: 0;">Error Information</h3>
            <p><strong>Chain:</strong> ${chainDisplayName}</p>
            <p><strong>Error Type:</strong> ${errorType}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin-top: 0;">Error Message</h3>
            <pre style="background-color: #ffffff; padding: 15px; border-radius: 4px; overflow-x: auto; color: #7f1d1d; white-space: pre-wrap; word-wrap: break-word;">${errorMessage}</pre>
          </div>
          
          ${additionalDetailsHtml}
          
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;"><strong>⚠️ Action Required:</strong> Please investigate this error and ensure the Clocktower caller is functioning correctly.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - ${chainDisplayName} Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await this.resend.emails.send({
        from: this.senderAddress,
        to: [this.notificationEmail],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        this.logger.error('Error email send failed', error);
        throw new Error(`Email error: ${error.message}`);
      }

      this.logger.info(`Error email sent: ${data.id}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to send error email', error);
      // Don't throw here - we don't want email failures to break the error handling flow
      return null;
    }
  }

  /**
   * Send summary email for multi-chain execution
   * @param {Array} results - Array of execution results
   * @returns {Promise<Object|null>} Email result or null if not configured
   */
  async sendSummaryEmail(results) {
    if (!this.isConfigured) {
      this.logger.info('Email configuration not available, skipping summary email notification');
      return null;
    }

    try {
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const executed = results.filter(r => (r.txCount || 0) > 0).length;
      const noSubs = results.filter(r => (r.txCount || 0) === 0 && r.status === 'no_subscriptions').length;
      const total = results.length;

      const subject = `📊 Clocktower Summary - ${executed} executed, ${noSubs} none, ${failed} failed`;
      
      // Create results table
      const resultsTable = results.map(result => {
        const statusIcon = !result.success ? '❌' : (result.txCount || 0) > 0 ? '✅' : 'ℹ️';
        const outcome = !result.success
          ? `Failed${result.error ? ` (${result.error})` : ''}`
          : (result.txCount || 0) > 0
            ? `Executed ${result.txCount} tx(s)`
            : 'No subscriptions';

        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; text-align: center;">${statusIcon}</td>
            <td style="padding: 8px;">${result.chain}</td>
            <td style="padding: 8px;">${outcome}</td>
          </tr>
        `;
      }).join('');

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">📊 Multi-Chain Execution Summary</h2>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">Overall Results</h3>
            <p><strong>Total Chains:</strong> ${total}</p>
            <p><strong>Executed Transactions:</strong> ${executed}</p>
            <p><strong>No Subscriptions:</strong> ${noSubs}</p>
            <p><strong>Failed:</strong> ${failed}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Chain Results</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Status</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Chain</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db;">Result</th>
                </tr>
              </thead>
              <tbody>
                ${resultsTable}
              </tbody>
            </table>
          </div>
          
          ${failed > 0 ? `
            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #dc2626;"><strong>⚠️ Warning:</strong> ${failed} chain(s) failed execution. Check logs for details.</p>
            </div>
          ` : `
            <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #166534;"><strong>🎉 All chains executed successfully!</strong></p>
            </div>
          `}
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Clocktower Caller - Multi-Chain Monitoring
          </p>
        </div>
      `;

      const { data, error } = await this.resend.emails.send({
        from: this.senderAddress,
        to: [this.notificationEmail],
        subject: subject,
        html: htmlContent,
      });

      if (error) {
        this.logger.error('Summary email error', error);
        throw new Error(`Email error: ${error.message}`);
      }

      this.logger.info(`Summary email sent: ${data.id}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to send summary email', error);
      throw error;
    }
  }

  /**
   * Get blockchain explorer URL for a transaction
   * @param {string} chainDisplayName - Chain display name
   * @param {string} txHash - Transaction hash
   * @returns {string} Explorer URL
   */
  getExplorerUrl(chainDisplayName, txHash) {
    const explorerUrls = {
      'Base': `https://basescan.org/tx/${txHash}`,
      'Base Sepolia': `https://sepolia.basescan.org/tx/${txHash}`,
      'Ethereum': `https://etherscan.io/tx/${txHash}`,
      'Arbitrum': `https://arbiscan.io/tx/${txHash}`,
      'Polygon': `https://polygonscan.com/tx/${txHash}`
    };

    return explorerUrls[chainDisplayName] || `https://etherscan.io/tx/${txHash}`;
  }

  /**
   * Check if email service is configured
   * @returns {boolean} True if configured
   */
  isEmailConfigured() {
    return this.isConfigured;
  }

  /**
   * Test email configuration
   * @returns {Promise<boolean>} True if test email sent successfully
   */
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      this.logger.warn('Email service not configured');
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.senderAddress,
        to: [this.notificationEmail],
        subject: 'Clocktower Caller - Test Email',
        html: '<p>This is a test email to verify email configuration.</p>',
      });

      if (error) {
        this.logger.error('Test email failed', error);
        return false;
      }

      this.logger.info(`Test email sent successfully: ${data.id}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send test email', error);
      return false;
    }
  }
}
