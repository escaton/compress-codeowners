### compress-codeowners

1. Run `yarn` to install all deps
2. Adjust `./getFiles.ts`
3. `yarn start compress --help`
4. To compare result with original CODEOWNERS, run
```shell
yarn start diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_CODEOWNERS>
```

You can also get detailed report for specific team:
```shell
yarn start diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_CODEOWNERS> -t <team>
```

And specific path:
```shell
yarn start diff <ORIGINAL_CODEOWNERS_PATH> <RESULT_CODEOWNERS> <path>
```