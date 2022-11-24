### compress-codeowners

1. Run `yarn` to install all deps
2. Get list of files of interest
    ```shell
    ./bin generate-files [-c <CWD>] \
        '**/*.(js|ts)' \
        '!**/node_modules' \
    > files.txt
    ```
    Check `files.txt` if that is ok
    Later you will need to put it in stdin for `compress` and `diff` command
3. ```shell
   cat files.txt | ./bin compress <ORIGINAL_CODEOWNERS_PATH> <RESULT_PATH>
   ```
4. To compare result with original CODEOWNERS, run

    ```shell
    cat files.txt | ./bin diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_PATH>
    ```

    You can also get detailed report for specific team:

    ```shell
    cat files.txt | ./bin diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_PATH> -t <team>
    ```

    And specific path:
    (note, `files.txt` is not needed in this case)

    ```shell
    ./bin diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_PATH> <path>
    ```
