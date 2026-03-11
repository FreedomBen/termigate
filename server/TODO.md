# Not Yet Run

Let's ensure we have full support for auth tokens, such that if the user wants to setup an auth token and disallow username/password auth, they can.  When auth token is enabled, the server should respond with a 401 or 403 to all requests that don't have the auth token included, even the home page.

Let's make sure the reset to default button in settings doesn't override the saved password info.

Let's add an direct edit for the settings config file to the settings page so users can optionally open the file in a text editor (inside the application's UI) and make direct changes to the file.

# Already Run
