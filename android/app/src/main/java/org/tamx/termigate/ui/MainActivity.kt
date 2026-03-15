package org.tamx.termigate.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import org.tamx.termigate.data.repository.AuthRepository
import org.tamx.termigate.ui.navigation.AppNavigation
import org.tamx.termigate.ui.theme.TermigateTheme
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var authRepository: AuthRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TermigateTheme {
                AppNavigation(authRepository = authRepository)
            }
        }
    }
}
