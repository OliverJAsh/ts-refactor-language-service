# ts-refactor-language-service

## Development

```bash
yarn
npm run start
```

To test the plugin in a project:

```bash
# In this folder
yarn link

# In the folder of the project where you want to test the plugin:
yarn link ts-refactor-language-service
```

Add this to `tsconfig.json`/`jsconfig.json`:

```json
{
    "compilerOptions": {
        "plugins": [
            {
                "name": "ts-refactor-language-service/target"
            }
        ]
    }
}
```

## References

-   https://stackoverflow.com/questions/13387728/typescript-language-services-examples/50191945#50191945
-   https://cancerberosgx.github.io/typescript-plugins-of-mine/sample-ts-plugin1/src/
-   https://github.com/cancerberoSgx/typescript-plugins-of-mine/tree/master/typescript-plugin-proactive-code-fixes
