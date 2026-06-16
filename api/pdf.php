<?php

// Disable display_errors to prevent PHP warnings from corrupting the PDF output
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Allow cross-origin requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../vendor/autoload.php';

use NfsePdf\NfsePdfGenerator;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// Check if file is uploaded and has no errors
if (!isset($_FILES['xml']) || $_FILES['xml']['error'] !== UPLOAD_ERR_OK) {
    header('HTTP/1.1 400 Bad Request');
    header('Content-Type: application/json; charset=utf-8');
    
    $errorCode = isset($_FILES['xml']['error']) ? $_FILES['xml']['error'] : 'no_file';
    $errorMessage = 'No XML file uploaded or upload error occurred.';
    
    switch ($errorCode) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            $errorMessage = 'The uploaded file exceeds the maximum allowed size.';
            break;
        case UPLOAD_ERR_PARTIAL:
            $errorMessage = 'The file was only partially uploaded.';
            break;
        case UPLOAD_ERR_NO_FILE:
            $errorMessage = 'No XML file was uploaded. Please make sure the field name is "xml".';
            break;
        case UPLOAD_ERR_NO_TMP_DIR:
            $errorMessage = 'Missing a temporary folder on the server.';
            break;
        case UPLOAD_ERR_CANT_WRITE:
            $errorMessage = 'Failed to write file to disk.';
            break;
    }
    
    echo json_encode(['error' => $errorMessage]);
    exit;
}

$uploadedFile = $_FILES['xml']['tmp_name'];

try {
    // Basic XML validation
    $xmlContent = file_get_contents($uploadedFile);
    if (empty($xmlContent)) {
        throw new Exception("The uploaded XML file is empty.");
    }
    
    // Disable entity loader for security to prevent XXE
    $previousEntityLoader = libxml_disable_entity_loader(true);
    $xml = simplexml_load_string($xmlContent);
    libxml_disable_entity_loader($previousEntityLoader);
    
    if ($xml === false) {
        throw new Exception("Invalid XML format.");
    }

    $generator = (new NfsePdfGenerator())
        ->parseXml($uploadedFile);

    // Optional: Add SVG logo and header configuration if present in the request
    $svgLogo = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-shield-shaded" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M8 14.933a1 1 0 0 0 .1-.025q.114-.034.294-.118c.24-.113.547-.29.893-.533a10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7 7 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 63 63 0 0 1 5.072.56"/>
</svg>';

    $generator->setLogoSvg($svgLogo)
        ->setHeaderInfo([
            'municipalityLine' => 'Prefeitura Municipal',
            'secretariatLine'  => 'Secretaria de Finanças',
        ]);

    $pdf = $generator->generate();

    // Output PDF directly
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="nfse.pdf"');
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('Pragma: public');
    
    // 'I' sends the file inline to the browser
    $pdf->Output('nfse.pdf', 'I');
} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Failed to generate PDF: ' . $e->getMessage()]);
}
