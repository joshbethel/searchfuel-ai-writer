/**
 * Email templates for account creation notifications
 * Provides HTML email templates for welcome emails and internal notifications
 */

/**
 * Get the base URL for the application
 * Used for generating links in emails
 */
function getAppUrl(): string {
  return Deno.env.get("APP_URL") || "https://app.trysearchfuel.com";
}

/**
 * Welcome email template for new users
 */
export function getWelcomeEmailTemplate(data: {
  userEmail: string;
  userName?: string;
  signupDate: string;
}): string {
  const { userEmail, userName, signupDate } = data;
  const appUrl = getAppUrl();
  const dashboardUrl = `${appUrl}/dashboard`;
  const plansUrl = `${appUrl}/plans`;
  
  const displayName = userName || userEmail.split("@")[0];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SearchFuel</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to SearchFuel! 🚀</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${displayName},
              </p>
              
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Welcome to SearchFuel! We're excited to have you on board. Your account has been successfully created on ${new Date(signupDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
              </p>
              
              <p style="margin: 0 0 30px; color: #333333; font-size: 16px; line-height: 1.6;">
                SearchFuel helps you create SEO-optimized content and publish it directly to your CMS. Here's what you can do next:
              </p>
              
              <!-- Next Steps -->
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                <h2 style="margin: 0 0 15px; color: #333333; font-size: 18px; font-weight: 600;">Next Steps:</h2>
                <ol style="margin: 0; padding-left: 20px; color: #555555; font-size: 15px; line-height: 1.8;">
                  <li style="margin-bottom: 10px;">Select a subscription plan that fits your needs</li>
                  <li style="margin-bottom: 10px;">Connect your CMS (WordPress, Webflow, Ghost, Shopify, or Framer)</li>
                  <li style="margin-bottom: 10px;">Start generating SEO-optimized articles</li>
                  <li>Publish directly to your website</li>
                </ol>
              </div>
              
              <!-- CTA Buttons -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 30px;">
                <tr>
                  <td align="center" style="padding: 0 10px 0 0;">
                    <a href="${plansUrl}" style="display: inline-block; padding: 14px 28px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Select a Plan</a>
                  </td>
                  <td align="center" style="padding: 0 0 0 10px;">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; background-color: #ffffff; color: #667eea; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #667eea;">Go to Dashboard</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                If there's anything we can do to help with your account, please email us at <a href="mailto:team@trysearchfuel.com" style="color: #667eea; text-decoration: none;">team@trysearchfuel.com</a>.
              </p>
              
              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Happy content creating!<br>
                The SearchFuel Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 10px; color: #999999; font-size: 12px;">
                This email was sent to ${userEmail}
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} SearchFuel. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Internal notification email template for team
 */
export function getInternalNotificationTemplate(data: {
  userEmail: string;
  userId: string;
  signupDate: string;
  totalUsers?: number;
  dailySignups?: number;
}): string {
  const { userEmail, userId, signupDate, totalUsers, dailySignups } = data;
  const appUrl = getAppUrl();
  const signupDateTime = new Date(signupDate).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New User Signup - SearchFuel</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #667eea; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">🎉 New User Signup</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                A new user has signed up for SearchFuel:
              </p>
              
              <!-- User Details -->
              <div style="background-color: #f8f9fa; padding: 20px; margin: 0 0 20px; border-radius: 6px; border-left: 4px solid #667eea;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600; width: 140px;">Email:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                      <a href="mailto:${userEmail}" style="color: #667eea; text-decoration: none;">${userEmail}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">User ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-family: monospace;">${userId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Signup Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${signupDateTime}</td>
                  </tr>
                  ${totalUsers !== undefined ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Total Users:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${totalUsers.toLocaleString()}</td>
                  </tr>
                  ` : ''}
                  ${dailySignups !== undefined ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Signups Today:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${dailySignups}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                This is an automated notification from SearchFuel.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} SearchFuel. Internal notification.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

