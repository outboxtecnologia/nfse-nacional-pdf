<?php

$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Normalize path (remove trailing slash if present, except for root)
$path = rtrim($requestUri, '/');
if (empty($path)) {
    $path = '/';
}

// Route /api/pdf to the api/pdf.php script
if ($path === '/api/pdf') {
    require __DIR__ . '/api/pdf.php';
    exit;
}

// Fallback response for other paths
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'message' => 'NFS-e Nacional PDF Generator API is running.',
    'endpoints' => [
        'POST /api/pdf' => 'Generates PDF from uploaded NFS-e XML file (form-data: xml)'
    ]
]);
