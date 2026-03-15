package org.tamx.termigate.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.flow.collectLatest
import org.tamx.termigate.data.network.AuthEvent
import org.tamx.termigate.data.repository.AuthRepository
import org.tamx.termigate.ui.login.LoginScreen

object Routes {
    const val LOGIN = "login"
    const val SESSIONS = "sessions"
    const val TERMINAL = "terminal/{target}"
    const val SETTINGS = "settings"

    fun terminal(target: String) = "terminal/$target"
}

@Composable
fun AppNavigation(
    authRepository: AuthRepository,
    navController: NavHostController = rememberNavController()
) {
    // Global 401 handling — navigate to login, clear back stack
    LaunchedEffect(Unit) {
        authRepository.authEvents.collectLatest { event ->
            when (event) {
                is AuthEvent.TokenExpired -> {
                    authRepository.clearToken()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
                is AuthEvent.RateLimited -> { /* handled by individual screens */ }
            }
        }
    }

    val startDestination = if (authRepository.getToken() != null) {
        Routes.SESSIONS
    } else {
        Routes.LOGIN
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Routes.SESSIONS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.SESSIONS) {
            // Placeholder until Phase 4
            SessionListPlaceholder()
        }
        composable(Routes.TERMINAL) {
            // Placeholder until Phase 5
        }
        composable(Routes.SETTINGS) {
            // Placeholder until Phase 7
        }
    }
}

@Composable
private fun SessionListPlaceholder() {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Sessions",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
    }
}
