package com.notica.gateway.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.notica.gateway.NoticaGatewayApp
import com.notica.gateway.config.Credentials
import com.notica.gateway.net.PairDevicePayload
import com.notica.gateway.service.GatewayService
import kotlinx.coroutines.launch

@Composable
fun PairingScreen() {
    val context = LocalContext.current
    val app = context.applicationContext as NoticaGatewayApp
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf("http://localhost:8000") }
    var pairingCode by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val qrLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            val scanned = result.contents
            try {
                val uri = Uri.parse(scanned)
                if (uri.scheme == "notica-gw" && uri.host == "pair") {
                    val serverParam = uri.getQueryParameter("server")
                    val codeParam = uri.getQueryParameter("code")
                    if (!serverParam.isNullOrBlank()) serverUrl = serverParam
                    if (!codeParam.isNullOrBlank()) pairingCode = codeParam
                }
            } catch (_: Exception) {
            }
        }
    }

    val permissionsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
    }

    fun executePairing() {
        if (serverUrl.isBlank() || pairingCode.isBlank()) {
            errorMessage = "Server URL and pairing code are required."
            return
        }

        isLoading = true
        errorMessage = null

        scope.launch {
            try {
                val sims = app.container.simInfoProvider.getActiveSims()
                val devicePayload = PairDevicePayload(
                    model = "${Build.MANUFACTURER} ${Build.MODEL}",
                    androidSdk = Build.VERSION.SDK_INT,
                    appVersion = "1.0.0",
                    sims = sims
                )

                val pairResult = app.container.apiClient.pair(
                    serverUrl = serverUrl.trim(),
                    code = pairingCode.trim().uppercase(),
                    devicePayload = devicePayload
                )

                pairResult.fold(
                    onSuccess = { response ->
                        val effectiveSocketUrl = try {
                            val serverUri = Uri.parse(serverUrl.trim())
                            val returnedSocketUri = Uri.parse(response.socketUrl)
                            val path = returnedSocketUri.path ?: "/gateway"
                            val portPart = if (serverUri.port != -1) ":${serverUri.port}" else ""
                            "${serverUri.scheme}://${serverUri.host}$portPart$path"
                        } catch (_: Exception) {
                            response.socketUrl
                        }

                        val creds = Credentials(
                            serverUrl = serverUrl.trim(),
                            deviceId = response.deviceId,
                            projectId = response.projectId,
                            deviceToken = response.deviceToken,
                            signingSecret = response.signingSecret,
                            socketUrl = effectiveSocketUrl
                        )
                        app.container.credentialStore.saveCredentials(creds)
                        GatewayService.start(context)
                        isLoading = false
                    },
                    onFailure = { error ->
                        isLoading = false
                        errorMessage = error.message ?: "Pairing failed. Please check the code."
                    }
                )
            } catch (e: Exception) {
                isLoading = false
                errorMessage = e.message ?: "Unexpected error during pairing"
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Notica SMS Gateway",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )
        Text(
            text = "Connect your Android device to relay SMS messages",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
        )

        // Permission Checklist Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Required Permissions",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))

                PermissionRow("Send SMS", Manifest.permission.SEND_SMS)
                PermissionRow("Read SIM State", Manifest.permission.READ_PHONE_STATE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    PermissionRow("Notifications", Manifest.permission.POST_NOTIFICATIONS)
                }
                PermissionRow("Camera (QR)", Manifest.permission.CAMERA)

                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = {
                        val needed = mutableListOf(
                            Manifest.permission.SEND_SMS,
                            Manifest.permission.READ_PHONE_STATE,
                            Manifest.permission.CAMERA
                        )
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            needed.add(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        permissionsLauncher.launch(needed.toTypedArray())
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Grant Required Permissions")
                }
            }
        }

        // QR Scanner Button
        Button(
            onClick = {
                val options = ScanOptions().apply {
                    setPrompt("Scan Notica Gateway pairing QR code")
                    setBeepEnabled(false)
                    setOrientationLocked(false)
                }
                qrLauncher.launch(options)
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.QrCodeScanner, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Scan Pairing QR Code")
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f))
            )
            Text(
                text = "OR ENTER MANUALLY",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f))
            )
        }

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            placeholder = { Text("https://api.notica.app") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it.uppercase() },
            label = { Text("Pairing Code") },
            placeholder = { Text("K7PQ-2XMD") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        if (errorMessage != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = errorMessage ?: "",
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        Button(
            onClick = { executePairing() },
            enabled = !isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(10.dp)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = MaterialTheme.colorScheme.onPrimary
                )
            } else {
                Text("Pair Device", fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun PermissionRow(name: String, permission: String) {
    val context = LocalContext.current
    val isGranted = ContextCompat.checkSelfPermission(
        context,
        permission
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = if (isGranted) Icons.Default.CheckCircle else Icons.Default.Warning,
            contentDescription = null,
            tint = if (isGranted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = name,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = if (isGranted) "Granted" else "Missing",
            fontSize = 12.sp,
            color = if (isGranted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
        )
    }
}
