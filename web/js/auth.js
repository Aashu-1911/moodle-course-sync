// Moodle Course Hub - Authentication Library

// Initialize Supabase Client
function initSupabase() {
  const url = window.ENV?.SUPABASE_URL;
  const key = window.ENV?.SUPABASE_ANON_KEY;

  if (!url || !key || url === "" || url.includes("your-project-id")) {
    showConfigWarning();
    return null;
  }

  if (typeof supabase === 'undefined') {
    console.error("Supabase CDN failed to load.");
    return null;
  }

  return supabase.createClient(url, key);
}

// Global Supabase client instance
window.supabaseClient = initSupabase();

function showConfigWarning() {
  // Try to display a user-friendly notice on the page
  document.addEventListener("DOMContentLoaded", () => {
    const warningDiv = document.createElement("div");
    warningDiv.style.position = "fixed";
    warningDiv.style.top = "10px";
    warningDiv.style.left = "50%";
    warningDiv.style.transform = "translateX(-50%)";
    warningDiv.style.background = "#ff4d4d";
    warningDiv.style.color = "white";
    warningDiv.style.padding = "12px 24px";
    warningDiv.style.borderRadius = "8px";
    warningDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    warningDiv.style.zIndex = "9999";
    warningDiv.style.fontFamily = "sans-serif";
    warningDiv.style.textAlign = "center";
    warningDiv.innerHTML = `
      <strong>Supabase Credentials Missing!</strong><br>
      Please configure <code>web/js/config.js</code> with your Supabase URL and Anon Key.
    `;
    document.body.appendChild(warningDiv);
  });
}

// Authentication Functions
const Auth = {
  // Sign up a new user
  async signUp(email, password) {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  // Sign in an existing user
  async signIn(email, password) {
    if (!window.supabaseClient) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  // Sign out current user
  async signOut() {
    if (!window.supabaseClient) {
      return;
    }
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) console.error("Error signing out:", error.message);
    localStorage.removeItem("sb-" + window.ENV.SUPABASE_URL.split("//")[1].split(".")[0] + "-auth-token"); // force local token cleanup if needed
    window.location.href = "index.html";
  },

  // Get currently logged-in user
  async getUser() {
    if (!window.supabaseClient) return null;
    const { data: { user }, error } = await window.supabaseClient.auth.getUser();
    if (error) return null;
    return user;
  },

  // Watch authentication state changes
  onAuthStateChange(callback) {
    if (!window.supabaseClient) return () => {};
    const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        callback(event, session);
      }
    );
    return () => subscription.unsubscribe();
  },

  // Guard page: Redirect to index.html if user is not authenticated
  async requireAuth() {
    const user = await this.getUser();
    if (!user) {
      window.location.href = "index.html";
    }
    return user;
  },

  // Guard login page: Redirect to dashboard.html if user is already authenticated
  async redirectIfAuthenticated() {
    const user = await this.getUser();
    if (user) {
      window.location.href = "dashboard.html";
    }
  }
};

window.Auth = Auth;
