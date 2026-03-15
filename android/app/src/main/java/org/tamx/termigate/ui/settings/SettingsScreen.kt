package org.tamx.termigate.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.tamx.termigate.data.model.QuickAction
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.error) {
        state.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.onDismissError()
        }
    }

    LaunchedEffect(state.loggedOut) {
        if (state.loggedOut) onLoggedOut()
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Quick Actions section
            SectionHeader("Quick Actions")
            if (state.quickActions.isEmpty()) {
                Text(
                    "No quick actions configured",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                state.quickActions.forEach { action ->
                    QuickActionRow(
                        action = action,
                        onEdit = { viewModel.onEditAction(action) },
                        onDelete = { action.id?.let { viewModel.onDeleteAction(it) } }
                    )
                }
            }
            OutlinedButton(
                onClick = viewModel::onAddAction,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Add Quick Action")
            }

            HorizontalDivider()

            // Display section
            SectionHeader("Display")

            // Font size
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Font Size",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    "${state.fontSize}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = FontFamily.Monospace
                )
            }
            Slider(
                value = state.fontSize.toFloat(),
                onValueChange = { viewModel.onFontSizeChanged(it.roundToInt()) },
                valueRange = 8f..24f,
                steps = 15
            )

            // Keep screen on
            SettingsToggle(
                label = "Keep Screen On",
                checked = state.keepScreenOn,
                onCheckedChange = viewModel::onKeepScreenOnChanged
            )

            // Vibrate on key press
            SettingsToggle(
                label = "Vibrate on Special Keys",
                checked = state.vibrateOnKey,
                onCheckedChange = viewModel::onVibrateChanged
            )

            HorizontalDivider()

            // Connection section
            SectionHeader("Connection")
            Text(
                text = state.serverUrl.ifEmpty { "Not configured" },
                style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = viewModel::onLogout,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Logout", color = MaterialTheme.colorScheme.error)
            }

            HorizontalDivider()

            // About section
            SectionHeader("About")
            Text(
                text = "termigate for Android v1.0.0",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    // Edit quick action dialog
    state.editingAction?.let { action ->
        EditQuickActionDialog(
            action = action,
            onSave = viewModel::onSaveAction,
            onDismiss = viewModel::onDismissEditAction
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun SettingsToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun QuickActionRow(
    action: QuickAction,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = action.label,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = action.command,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier)
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

@Composable
private fun EditQuickActionDialog(
    action: QuickAction,
    onSave: (QuickAction) -> Unit,
    onDismiss: () -> Unit
) {
    var label by remember { mutableStateOf(action.label) }
    var command by remember { mutableStateOf(action.command) }
    var confirm by remember { mutableStateOf(action.confirm) }
    var color by remember { mutableStateOf(action.color) }

    val colors = listOf("default", "green", "red", "yellow", "blue")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (action.id != null) "Edit Quick Action" else "New Quick Action") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = command,
                    onValueChange = { command = it },
                    label = { Text("Command") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Monospace
                    )
                )
                SettingsToggle(
                    label = "Require Confirmation",
                    checked = confirm,
                    onCheckedChange = { confirm = it }
                )
                // Color picker
                Text("Color", style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    colors.forEach { c ->
                        Surface(
                            onClick = { color = c },
                            shape = RoundedCornerShape(8.dp),
                            color = colorForName(c),
                            modifier = Modifier
                                .height(36.dp)
                                .weight(1f),
                            border = if (c == color) {
                                androidx.compose.foundation.BorderStroke(
                                    2.dp,
                                    MaterialTheme.colorScheme.primary
                                )
                            } else null
                        ) {
                            // Empty content — the color is the indicator
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        action.copy(
                            label = label,
                            command = command,
                            confirm = confirm,
                            color = color
                        )
                    )
                },
                enabled = label.isNotBlank() && command.isNotBlank()
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun colorForName(name: String): androidx.compose.ui.graphics.Color {
    return when (name) {
        "green" -> androidx.compose.ui.graphics.Color(0xFF2E7D32)
        "red" -> androidx.compose.ui.graphics.Color(0xFFC62828)
        "yellow" -> androidx.compose.ui.graphics.Color(0xFFF9A825)
        "blue" -> androidx.compose.ui.graphics.Color(0xFF1565C0)
        else -> MaterialTheme.colorScheme.surfaceContainerHighest
    }
}
