<?php

/**
 * Front controller of the sample website with Apache, in place of `local/router.php`: the rules
 * of `.htaccess`, at the root of the project, send it every request that is not a file.
 */

require __DIR__ . '/local/site/app.php';

if (!site_handle(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    site_start_session();
    site_not_found();
}
