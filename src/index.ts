const init = ({
    typescript: ts,
}: {
    typescript: typeof import('typescript/lib/tsserverlibrary');
}) => {
    const positionOrRangeToNumber = (
        positionOrRange: number | ts.TextRange,
    ): number =>
        typeof positionOrRange === 'number'
            ? positionOrRange
            : (positionOrRange as ts.TextRange).pos;

    const findChildContainingPosition = (
        sourceFile: ts.SourceFile,
        position: number,
    ): ts.Node | undefined => {
        const find = (node: ts.Node): ts.Node | undefined => {
            if (position >= node.getStart() && position < node.getEnd()) {
                return ts.forEachChild(node, find) || node;
            }
        };

        return find(sourceFile);
    };

    const create = (info: ts.server.PluginCreateInfo) => {
        // Diagnostic logging
        info.project.projectService.logger.info(
            "I'm getting set up now! Check the log for this message.",
        );

        // Set up decorator
        const proxy: ts.LanguageService = Object.create(null);
        for (let k of Object.keys(info.languageService) as Array<
            keyof ts.LanguageService
        >) {
            const x = info.languageService[k];
            // TODO:
            // @ts-ignore
            proxy[k] = (...args: Array<{}>) =>
                x.apply(info.languageService, args);
        }

        proxy.getApplicableRefactors = (
            fileName,
            positionOrRange,
        ): ts.ApplicableRefactorInfo[] => {
            const refactors =
                info.languageService.getApplicableRefactors(
                    fileName,
                    positionOrRange,
                    undefined,
                ) || [];
            const program = info.languageService.getProgram();
            const sourceFile = program.getSourceFile(fileName);
            if (!sourceFile) {
                return refactors;
            }
            const refactorInfo: ts.ApplicableRefactorInfo = {
                name: 'wrap-function-reference-info',
                description: 'wrap function reference desc',
                actions: [
                    {
                        name: 'wrap-function-reference',
                        description: 'Wrap function reference',
                    },
                ],
            };
            const nodeAtCursor = findChildContainingPosition(
                sourceFile,
                positionOrRangeToNumber(positionOrRange),
            );
            // TODO: reverse, find call expression first, then check param type
            if (
                nodeAtCursor &&
                nodeAtCursor.kind === ts.SyntaxKind.Identifier
            ) {
                const typeChecker = program.getTypeChecker();
                const type = typeChecker.getTypeAtLocation(nodeAtCursor);
                const signatures = type.getCallSignatures();
                const isFunction = signatures.length > 0;
                if (
                    isFunction &&
                    nodeAtCursor.parent &&
                    nodeAtCursor.parent.kind === ts.SyntaxKind.CallExpression
                ) {
                    refactors.push(refactorInfo);
                }
            }
            return refactors;
        };

        proxy.getEditsForRefactor = (
            fileName,
            formatOptions,
            positionOrRange,
            refactorName,
            actionName,
            preferences,
        ) => {
            const refactors = info.languageService.getEditsForRefactor(
                fileName,
                formatOptions,
                positionOrRange,
                refactorName,
                actionName,
                preferences,
            );
            if (actionName !== 'wrap-function-reference') {
                return refactors;
            }
            const program = info.languageService.getProgram();
            const sourceFile = program.getSourceFile(fileName);
            if (!sourceFile) {
                return refactors;
            }
            const nodeAtCursor = findChildContainingPosition(
                sourceFile,
                positionOrRangeToNumber(positionOrRange),
            );
            if (
                nodeAtCursor !== undefined &&
                nodeAtCursor.kind === ts.SyntaxKind.Identifier &&
                // TODO:
                // must be call expression, we already checked
                // assert anyway?
                ts.isCallExpression(nodeAtCursor.parent)
            ) {
                const typeChecker = program.getTypeChecker();

                const parentCallExpression = nodeAtCursor.parent;
                const resolvedSignature = typeChecker.getResolvedSignature(
                    parentCallExpression,
                );

                const parameters = resolvedSignature.getParameters();
                const firstParamSymbol = parameters[0];

                if (firstParamSymbol === undefined) {
                    throw new Error('Expected parameter but got none.');
                }

                const { valueDeclaration: firstParam } = firstParamSymbol;

                // TODO: why do we need to check this is a parameter?
                if (!ts.isParameter(firstParam)) {
                    throw new Error('Expected type to be parameter.');
                }

                // TODO: support unions e.g. `string | () => string`
                if (!ts.isFunctionTypeNode(firstParam.type)) {
                    throw new Error('Parameter type is not a function.');
                }

                const callbackParameterType = firstParam.type;

                const callbackParameterParameterNames = callbackParameterType.parameters.map(
                    (parameter) => parameter.name.getText(),
                );

                const innerCallExpression = ts.createCall(
                    ts.createIdentifier(nodeAtCursor.getText()),
                    undefined,
                    // arguments
                    callbackParameterParameterNames.map((name) =>
                        ts.createIdentifier(name),
                    ),
                );

                const arrowFunction = ts.createArrowFunction(
                    undefined,
                    undefined,
                    // parameters
                    callbackParameterParameterNames.map((parameter) =>
                        ts.createParameter(
                            undefined,
                            undefined,
                            undefined,
                            parameter,
                        ),
                    ),
                    undefined,
                    undefined,
                    innerCallExpression,
                );

                const printer = ts.createPrinter({
                    newLine: ts.NewLineKind.LineFeed,
                });

                const printed = printer.printNode(
                    ts.EmitHint.Unspecified,
                    arrowFunction,
                    sourceFile,
                );

                return {
                    edits: [
                        {
                            fileName,
                            textChanges: [
                                {
                                    span: {
                                        start: nodeAtCursor.pos,
                                        length:
                                            nodeAtCursor.end - nodeAtCursor.pos,
                                    },
                                    newText: printed,
                                },
                            ],
                        },
                    ],
                    renameFilename: undefined,
                    renameLocation: undefined,
                };
            } else {
                return refactors;
            }
        };

        return proxy;
    };

    return { create };
};

export = init;
